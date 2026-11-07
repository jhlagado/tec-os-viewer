/* Darwin identity probe and stopped-child launcher. Source-prepared, unrun.
 * No shell, process-name matching, ps timestamp, or signal-by-name path. */
#include <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define MAX_PIDS 65536
#define MAX_EXE_BYTES (512ULL * 1024 * 1024)
static void fail(const char *s) { perror(s); exit(70); }
static pid_t number(const char *s) {
  char *end; long n = strtol(s, &end, 10);
  if (!*s || *end || n < 2 || n > INT32_MAX) { errno=EINVAL; fail("pid"); }
  return (pid_t)n;
}
static void quoted(const char *s) {
  putchar('"');
  for (const unsigned char *p=(const unsigned char *)s; *p; p++) {
    if (*p=='"' || *p=='\\') printf("\\%c", *p);
    else if (*p<32 || *p>=127) printf("\\u%04x", *p);
    else putchar(*p);
  }
  putchar('"');
}
static int bsd(pid_t pid, struct proc_bsdinfo *b) {
  errno=0;
  int n=proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, b, sizeof(*b));
  if (!n && errno==ESRCH) return 0;
  if (n!=sizeof(*b) || b->pbi_pid!=(uint32_t)pid) fail("proc_pidinfo unknown");
  return 1;
}
static int same(const struct proc_bsdinfo *a, const struct proc_bsdinfo *b) {
  return a->pbi_pid==b->pbi_pid && a->pbi_start_tvsec==b->pbi_start_tvsec &&
    a->pbi_start_tvusec==b->pbi_start_tvusec && a->pbi_pgid==b->pbi_pgid && a->pbi_ppid==b->pbi_ppid;
}
static void hashfile(const char *path, char hex[65]) {
  int fd=open(path, O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
  struct stat before, after;
  if (fd<0 || fstat(fd,&before) || !S_ISREG(before.st_mode) || before.st_size<0 ||
      (uint64_t)before.st_size>MAX_EXE_BYTES) fail("executable open/size");
  CC_SHA256_CTX ctx; CC_SHA256_Init(&ctx);
  unsigned char buf[65536], digest[CC_SHA256_DIGEST_LENGTH]; ssize_t n; uint64_t total=0;
  while ((n=read(fd,buf,sizeof(buf)))>0) {
    total+=(uint64_t)n;
    if (total>MAX_EXE_BYTES) { errno=EFBIG; fail("executable grew"); }
    CC_SHA256_Update(&ctx,buf,(CC_LONG)n);
  }
  if (n<0 || fstat(fd,&after) || before.st_dev!=after.st_dev || before.st_ino!=after.st_ino ||
      before.st_size!=after.st_size || before.st_mtimespec.tv_sec!=after.st_mtimespec.tv_sec ||
      before.st_mtimespec.tv_nsec!=after.st_mtimespec.tv_nsec || total!=(uint64_t)before.st_size)
    fail("executable changed");
  close(fd); CC_SHA256_Final(digest,&ctx);
  for (int i=0;i<CC_SHA256_DIGEST_LENGTH;i++) sprintf(hex+2*i,"%02x",digest[i]);
}
static void identity(pid_t pid) {
  struct proc_bsdinfo a,b; char path[PROC_PIDPATHINFO_MAXSIZE], again[PROC_PIDPATHINFO_MAXSIZE], hash[65];
  if (!bsd(pid,&a)) { printf("{\"state\":\"absent\",\"pid\":%d}\n",pid); return; }
  pid_t sid=getsid(pid);
  if (sid<0 || proc_pidpath(pid,path,sizeof(path))<=0) fail("path/session unknown");
  hashfile(path,hash);
  struct rusage_info_v4 usage;
  if (proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t *)&usage)) fail("memory unknown");
  if (!bsd(pid,&b) || !same(&a,&b) || getsid(pid)!=sid ||
      proc_pidpath(pid,again,sizeof(again))<=0 || strcmp(path,again)) fail("identity changed during probe");
  printf("{\"state\":\"present\",\"pid\":%d,\"ppid\":%u,\"pgid\":%u,\"sid\":%d,"
    "\"birthSec\":%llu,\"birthUsec\":%llu,\"status\":%u,\"memoryBytes\":%llu,\"exe\":",pid,
    a.pbi_ppid,a.pbi_pgid,sid,(unsigned long long)a.pbi_start_tvsec,
    (unsigned long long)a.pbi_start_tvusec,a.pbi_status,
    (unsigned long long)(usage.ri_resident_size>usage.ri_phys_footprint?usage.ri_resident_size:usage.ri_phys_footprint));
  quoted(path); printf(",\"exeSha256\":\"%s\"}\n",hash);
}
static void table(void) {
  pid_t pids[MAX_PIDS]; int n=proc_listallpids(pids,sizeof(pids));
  if (n<=0 || n>=MAX_PIDS) fail("process enumeration unknown/truncated");
  printf("["); int comma=0;
  for (int i=0;i<n;i++) if (pids[i]>1) {
    struct proc_bsdinfo b;
    if (!bsd(pids[i],&b)) continue;
    pid_t sid=getsid(pids[i]); if (sid<0) fail("table session unknown");
    printf("%s{\"pid\":%u,\"ppid\":%u,\"pgid\":%u,\"sid\":%d,\"birthSec\":%llu,\"birthUsec\":%llu}",
      comma++?",":"",b.pbi_pid,b.pbi_ppid,b.pbi_pgid,sid,
      (unsigned long long)b.pbi_start_tvsec,(unsigned long long)b.pbi_start_tvusec);
  }
  puts("]");
}
/* Parent is an already-registered launch service. The child cannot execute any
 * target code until both stopped phases have independently acknowledged records.
 * The parent never reaps the child before signalling it, preventing PID reuse
 * for these SIGCONT operations. EOF or timeout leaves the stopped child owned;
 * it does not silently continue it or declare cleanup. */
static void ack(const char *nonce, const char *phase) {
  struct pollfd p={.fd=STDIN_FILENO,.events=POLLIN}; char got[256], want[256];
  if (snprintf(want,sizeof(want),"%s %s\n",nonce,phase)>=(int)sizeof(want)) fail("nonce length");
  int flags=fcntl(STDIN_FILENO,F_GETFL);
  if(flags<0 || fcntl(STDIN_FILENO,F_SETFL,flags|O_NONBLOCK)<0) fail("ack nonblocking");
  uint64_t until=clock_gettime_nsec_np(CLOCK_MONOTONIC)+250000000; size_t used=0;
  for (;;) {
    uint64_t now=clock_gettime_nsec_np(CLOCK_MONOTONIC);
    if(now>=until || used>=sizeof(got)-1) { errno=ETIMEDOUT; fail("ack deadline/size"); }
    int ms=(int)((until-now+999999)/1000000);
    int r=poll(&p,1,ms);
    if(r<0 && errno==EINTR) continue;
    if(r!=1) { errno=ETIMEDOUT; fail("ack missing"); }
    ssize_t n=read(STDIN_FILENO,got+used,1);
    if(n<0 && (errno==EAGAIN || errno==EINTR)) continue;
    if(n!=1) fail("ack EOF");
    if(got[used++]=='\n') break;
  }
  got[used]=0;
  if(strcmp(got,want)) { errno=EINVAL; fail("ack mismatch"); }
}
static void stopped(pid_t child) {
  int s; pid_t p;
  do { p=waitpid(child,&s,WUNTRACED); } while(p<0 && errno==EINTR);
  if (p!=child || !WIFSTOPPED(s) || WSTOPSIG(s)!=SIGSTOP) fail("child not stopped");
}
static void launch(const char *nonce, char **command) {
  if (command[0][0]!='/') { errno=EINVAL; fail("absolute executable required"); }
  pid_t child=fork(); if (child<0) fail("fork");
  if (!child) {
    raise(SIGSTOP); /* inherited registered group, before setsid */
    if (setsid()<0) _exit(70);
    raise(SIGSTOP); /* planned group must be confirmed before exec */
    /* This child is the persistent group anchor; only its worker execs.
     * The worker inherits this registered group and stops before exec. */
    pid_t worker=fork(); if(worker<0) _exit(70);
    if(!worker) { raise(SIGSTOP); execv(command[0],command); _exit(127); }
    stopped(worker); puts("worker"); identity(worker); fflush(stdout);
    ack(nonce,"worker"); if(kill(worker,SIGCONT)) fail("continue worker");
    int s; while(waitpid(worker,&s,0)<0) if(errno!=EINTR) fail("wait worker");
    printf("target-exited %d\n",WIFEXITED(s)?WEXITSTATUS(s):128+WTERMSIG(s)); fflush(stdout);
    /* Remain a live group leader until verified cleanup signals this anchor. */
    for(;;) pause();
  }
  stopped(child); puts("inherited"); identity(child); fflush(stdout);
  ack(nonce,"inherited"); if (kill(child,SIGCONT)) fail("continue inherited child");
  stopped(child); puts("session"); identity(child); fflush(stdout);
  ack(nonce,"session"); if (kill(child,SIGCONT)) fail("continue session child");
  int s; while(waitpid(child,&s,0)<0) if(errno!=EINTR) fail("wait child");
  exit(WIFEXITED(s)?WEXITSTATUS(s):128+WTERMSIG(s));
}
int main(int argc,char **argv) {
  if(argc==3 && !strcmp(argv[1],"identity")) identity(number(argv[2]));
  else if(argc==2 && !strcmp(argv[1],"table")) table();
  else if(argc>=5 && !strcmp(argv[1],"launch") && !strcmp(argv[3],"--")) launch(argv[2],argv+4);
  else { fputs("identity PID | table | launch NONCE -- /absolute/executable ARG...\n",stderr); return 64; }
  return 0;
}
