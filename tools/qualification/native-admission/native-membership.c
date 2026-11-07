/* Source-only capability candidate. Never built or run during preparation.
 * Probe: read-only self + its exact direct supervisor; no census/classifier.
 * Supervisor: one fork/exec, private pipe, signals only its unreaped child.
 */
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <mach/mach_time.h>
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
#include <unistd.h>

#define WINDOW 150000000ULL
#define OPERATOR 2000000000ULL
#define MEMORY (700ULL * 1024 * 1024)
#define MAX_SAMPLES 400
#define MAGIC 0x50364d43U
extern char **environ;
static mach_timebase_info_data_t tb;
static uint64_t clockns(void) {
  /* Exact quotient/remainder conversion, with no128-bit compiler-runtime edge. */
  uint64_t ticks=mach_continuous_time(), q=ticks/tb.denom, r=ticks%tb.denom;
  if(q>UINT64_MAX/tb.numer) return UINT64_MAX;
  uint64_t whole=q*tb.numer, fraction=(r*tb.numer)/tb.denom;
  return whole>UINT64_MAX-fraction?UINT64_MAX:whole+fraction;
}
static int clockinit(void) { return mach_timebase_info(&tb) || !tb.denom || !tb.numer; }
static int decimal(const char *s, uint64_t *out) {
  uint64_t n=0; size_t i=0;
  for (; s[i]; i++) {
    if(i>=20 || s[i]<'0' || s[i]>'9' || n>(UINT64_MAX-(unsigned)(s[i]-'0'))/10) return -1;
    n=n*10+(unsigned)(s[i]-'0');
  }
  if(!i) return -1;
  *out=n; return 0;
}
struct identity { uint64_t sec, usec; uint32_t pid, ppid; };
static int identity(pid_t pid, struct identity *id, int *saved) {
  struct proc_bsdinfo b; memset(&b,0,sizeof(b)); errno=0;
  int n=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&b,sizeof(b)); *saved=errno;
  if(n!=(int)sizeof(b) || *saved || b.pbi_pid!=(uint32_t)pid) return n ? -1 : 0;
  id->sec=b.pbi_start_tvsec; id->usec=b.pbi_start_tvusec;
  id->pid=b.pbi_pid; id->ppid=b.pbi_ppid; return 1;
}
struct reading { uint64_t begin, end; int32_t pid, op, value, error; };
struct packet {
  uint32_t magic, version, count, failure;
  int32_t self, coordinator, detailBefore, detailAfter, errnoBefore, errnoAfter;
  uint64_t t0, deadline, completed;
  struct identity before, after;
  struct reading reads[4];
};
_Static_assert(sizeof(struct packet)<=512,"one bounded pipe write");
static int probe(int argc,char **argv) {
  uint64_t v[5]; struct packet p; memset(&p,0,sizeof(p));
  if(argc!=7 || *environ || clockinit()) return 64;
  for(int i=0;i<5;i++) if(decimal(argv[i+2],&v[i])) return 64;
  if(v[0]<2 || v[0]>INT32_MAX || v[2]>999999 || v[4]<=v[3] || v[4]-v[3]!=WINDOW) return 64;
  p.magic=MAGIC; p.version=1; p.self=getpid(); p.coordinator=(int32_t)v[0];
  p.t0=v[3]; p.deadline=v[4];
  if(getppid()!=p.coordinator || clockns()<p.t0 || clockns()>=p.deadline) p.failure=1;
  if(!p.failure) {
    p.detailBefore=identity(p.coordinator,&p.before,&p.errnoBefore);
    if(p.detailBefore!=1 || p.before.sec!=v[1] || p.before.usec!=v[2]) p.failure=2;
  }
  for(int i=0;i<4 && !p.failure;i++) {
    struct reading *r=&p.reads[p.count]; r->pid=i<2?p.self:p.coordinator; r->op=i%2;
    r->begin=clockns();
    if(r->begin>=p.deadline) { p.failure=3; break; }
    errno=0; r->value=r->op?getpgid(r->pid):getsid(r->pid); r->error=errno;
    r->end=clockns(); p.count++;
    if(r->value<=0 || r->error || r->end>=p.deadline) p.failure=4;
  }
  if(!p.failure) {
    p.detailAfter=identity(p.coordinator,&p.after,&p.errnoAfter);
    if(p.detailAfter!=1 || memcmp(&p.before,&p.after,sizeof(p.before)) || getppid()!=p.coordinator) p.failure=5;
  }
  p.completed=clockns(); if(p.completed>=p.deadline && !p.failure) p.failure=6;
  ssize_t n=write(STDOUT_FILENO,&p,sizeof(p));
  if(n!=(ssize_t)sizeof(p)) return 74;
  return p.failure?70:0;
}
static int memory(pid_t pid,uint64_t *bytes) {
  struct rusage_info_v4 r; memset(&r,0,sizeof(r));
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t *)&r)) return -1;
  *bytes=r.ri_resident_size>r.ri_phys_footprint?r.ri_resident_size:r.ri_phys_footprint;
  return 0;
}
static int sample4(pid_t owner,const struct identity *expected,const struct identity *host,pid_t child,
    uint64_t deadline,uint64_t *sum) {
  uint64_t a=0,b=0,c=0,d=0; struct identity before,after,hbefore,hafter; int e=0;
  if(clockns()>=deadline || getppid()!=owner || identity(owner,&before,&e)!=1 ||
      memcmp(&before,expected,sizeof(before)) || identity((pid_t)host->pid,&hbefore,&e)!=1 ||
      memcmp(&hbefore,host,sizeof(hbefore)) || clockns()>=deadline || memory(getpid(),&a) ||
      clockns()>=deadline || memory(child,&b) || clockns()>=deadline || memory(owner,&c) ||
      clockns()>=deadline || memory((pid_t)host->pid,&d) || clockns()>=deadline ||
      identity((pid_t)host->pid,&hafter,&e)!=1 || memcmp(&hafter,host,sizeof(hafter)) ||
      clockns()>=deadline || identity(owner,&after,&e)!=1 || clockns()>=deadline ||
      memcmp(&after,expected,sizeof(after)) || a>MEMORY || b>MEMORY-a || c>MEMORY-a-b || d>MEMORY-a-b-c) return -1;
  *sum=a+b+c+d; return 0;
}
static int supervise(int argc,char **argv) {
  /* Receipt FD is exclusively owned by this allocation, nonblocking, not a terminal. */
  struct stat out; struct identity me, external, host; int e=0;
  pid_t owner=getppid();
  if(argc!=3 || argv[2][0]!='/' || *environ || clockinit() ||
      fstat(1,&out) || !S_ISREG(out.st_mode) || out.st_uid!=getuid() ||
      (out.st_mode&077) || out.st_size || identity(getpid(),&me,&e)!=1 ||
      owner<2 || identity(owner,&external,&e)!=1 || external.ppid<2 ||
      identity((pid_t)external.ppid,&host,&e)!=1) return 64;
  int flags=fcntl(1,F_GETFL);
  if(flags<0 || fcntl(1,F_SETFL,flags|O_NONBLOCK)<0) return 64;
  int fds[2]; if(pipe(fds)) return 70;
  for(int i=0;i<2;i++) {
    int f=fcntl(fds[i],F_GETFL);
    if(f<0 || fcntl(fds[i],F_SETFL,f|O_NONBLOCK)<0 || fcntl(fds[i],F_SETFD,FD_CLOEXEC)<0) return 70;
  }
  /* Explicit SIG_IGN/SA_NOCLDWAIT can auto-reap and destroy PID pinning. */
  struct sigaction sa; memset(&sa,0,sizeof(sa)); sa.sa_handler=SIG_DFL;
  if(sigemptyset(&sa.sa_mask) || sigaction(SIGCHLD,&sa,NULL)) return 70;
  struct sigaction actual;
  if(sigaction(SIGCHLD,NULL,&actual) || actual.sa_handler!=SIG_DFL || (actual.sa_flags&SA_NOCLDWAIT)) return 70;
  char pid[24],sec[24],usec[24],start[24],end[24];
  snprintf(pid,sizeof(pid),"%u",me.pid); snprintf(sec,sizeof(sec),"%llu",(unsigned long long)me.sec);
  snprintf(usec,sizeof(usec),"%llu",(unsigned long long)me.usec);
  uint64_t t0=clockns(), deadline=t0+WINDOW, operator=t0+OPERATOR;
  snprintf(start,sizeof(start),"%llu",(unsigned long long)t0);
  snprintf(end,sizeof(end),"%llu",(unsigned long long)deadline);
  pid_t child=fork(); if(child<0) return 70;
  if(!child) {
    close(fds[0]);
    int null=open("/dev/null",O_RDWR);
    if(null<0 || dup2(null,0)<0 || dup2(null,2)<0 || dup2(fds[1],1)<0) _exit(126);
    close(null); close(fds[1]);
    char *args[]={argv[2],"--probe",pid,sec,usec,start,end,NULL}; char *env[]={NULL};
    if(raise(SIGSTOP)) _exit(126); /* Exact stopped child, before target exec. */
    execve(argv[2],args,env); _exit(127);
  }
  close(fds[1]);
  struct packet p; memset(&p,0,sizeof(p)); unsigned char raw[513]; size_t used=0;
  int status=0,reaped=0,failed=0,signalSent=0,eof=0,samples=0,authority=1; uint64_t peak=0,reapedAt=0,capturedAt=0;
  int stopped=0;
  for(int i=0;i<200 && !stopped && !reaped && authority && clockns()<deadline;i++) {
    pid_t w=waitpid(child,&status,WUNTRACED|WNOHANG);
    if(w==child) {
      if(WIFSTOPPED(status) && WSTOPSIG(status)==SIGSTOP) stopped=1;
      else if(WIFEXITED(status) || WIFSIGNALED(status)) { reaped=1; reapedAt=clockns(); }
      else failed=1;
    } else if(w<0 && errno!=EINTR) { authority=0; failed=1; }
    if(!stopped && !reaped && authority) (void)poll(NULL,0,1);
  }
  if(!stopped) failed=1;
  if(stopped && !failed) {
    uint64_t sum=0;
    if(sample4(owner,&external,&host,child,deadline,&sum)) failed=1;
    else { samples=1; peak=sum; }
    if(clockns()>=deadline) failed=1;
    if(!failed && kill(child,SIGCONT)) failed=1;
  }
  for(;!reaped && authority;) {
    uint64_t now=clockns();
    /* After either startup or terminal reap, After it returns child, never signal that PID. */
    pid_t w=waitpid(child,&status,WNOHANG);
    if(w==child) { reaped=1; reapedAt=clockns(); }
    else if(w<0 && errno!=EINTR) { failed=1; authority=0; break; }
    ssize_t n=read(fds[0],raw+used,sizeof(raw)-used);
    if(n>0) used+=(size_t)n;
    else if(!n) eof=1;
    else if(errno!=EAGAIN && errno!=EINTR) failed=1;
    capturedAt=clockns();
    if(used>sizeof(p) || capturedAt>=deadline) failed=1;
    if(reaped) break;
    if(samples<MAX_SAMPLES && !failed) {
      uint64_t sum=0;
      if(sample4(owner,&external,&host,child,deadline,&sum)) failed=1;
      else if(sum>peak) peak=sum;
      samples++;
    }
    now=clockns(); /* Refresh after every potentially stalled observation. */
    if(samples>=MAX_SAMPLES || now>=deadline) failed=1;
    if(failed && !signalSent) {
      /* Unreaped direct child remains reserved even if it exits in this interval. */
      if(kill(child,SIGKILL) && errno!=ESRCH) failed=1;
      signalSent=1;
    }
    now=clockns();
    if(now>=operator) break;
    struct pollfd fd={.fd=fds[0],.events=POLLIN}; (void)poll(&fd,1,5);
  }
  close(fds[0]);
  /* No claim of physical2s termination. Keep direct-child ownership if still held.
   * Do not exit and orphan it, or signal after consuming its wait status. */
  if(!reaped) {
    if(authority && !signalSent) { (void)kill(child,SIGKILL); signalSent=1; }
    char held[2048], hex[1027]; const char digits[]="0123456789abcdef";
    for(size_t i=0;i<used;i++) { hex[2*i]=digits[raw[i]>>4]; hex[2*i+1]=digits[raw[i]&15]; }
    hex[2*used]=0;
    int size=snprintf(held,sizeof(held),
      "{\"kind\":\"NATIVE_MEMBERSHIP\",\"outcome\":\"UNKNOWN_HELD\",\"exactExit\":false,\"operatorExpired\":%s,\"childPid\":%d,\"coordinatorPid\":%u,\"t0Ns\":\"%llu\",\"operatorDeadlineNs\":\"%llu\",\"waitAuthority\":%d,\"rawPacketHex\":\"%s\"}\n",
      clockns()>=operator?"true":"false",child,me.pid,(unsigned long long)t0,
      (unsigned long long)operator,authority,hex);
    if(size>0 && size<(int)sizeof(held)) (void)write(1,held,(size_t)size);
    if(!authority) { for(;;) pause(); } /* Lost wait authority: no numeric signal/release. */
    for(;;) {
      pid_t w=waitpid(child,&status,0);
      if(w==child) break;
      if(w<0 && errno!=EINTR) { for(;;) pause(); }
    }
    return 70;
  }
  if(used==sizeof(p)) memcpy(&p,raw,sizeof(p));
  int ok=!failed && samples>0 && peak>0 && used==sizeof(p) && p.magic==MAGIC && p.version==1 &&
    p.self==child && p.coordinator==(int32_t)me.pid && !p.failure && p.count==4 &&
    p.t0==t0 && p.deadline==deadline && p.completed<deadline && reapedAt<deadline && capturedAt<deadline &&
    WIFEXITED(status) && WEXITSTATUS(status)==0;
  /* Fixed binary packet decoded only here; no untrusted strings in JSON. */
  char rawhex[1027]; const char hexchars[]="0123456789abcdef";
  for(size_t i=0;i<used;i++) { rawhex[2*i]=hexchars[raw[i]>>4]; rawhex[2*i+1]=hexchars[raw[i]&15]; }
  rawhex[2*used]=0;
  char text[4096]; int len=snprintf(text,sizeof(text),
    "{\"kind\":\"NATIVE_MEMBERSHIP\",\"outcome\":\"%s\",\"cohortQualified\":false,\"pidIdentityQualified\":false,\"t0Ns\":\"%llu\",\"deadlineNs\":\"%llu\",\"reapedAtNs\":\"%llu\",\"childPid\":%d,\"coordinatorPid\":%u,\"coordinatorBirthSec\":\"%llu\",\"coordinatorBirthUsec\":\"%llu\",\"exactExit\":true,\"waitStatus\":%d,\"packetBytes\":%zu,\"eof\":%d,\"samples\":%d,\"peakSampleBytes\":%llu,\"signalSent\":%d,\"probeFailure\":%u,\"detailBefore\":%d,\"detailAfter\":%d,\"errnoBefore\":%d,\"errnoAfter\":%d,\"membershipReads\":[",
    ok?"OBSERVED_ONLY_FOR_REQUESTED_PIDS":"UNKNOWN_HELD",(unsigned long long)t0,
    (unsigned long long)deadline,(unsigned long long)reapedAt,child,me.pid,
    (unsigned long long)me.sec,(unsigned long long)me.usec,status,used,eof,samples,
    (unsigned long long)peak,signalSent,p.failure,p.detailBefore,p.detailAfter,p.errnoBefore,p.errnoAfter);
  if(len<0 || len>=(int)sizeof(text)) return 74;
  for(unsigned i=0;i<p.count && i<4;i++) {
    struct reading *r=&p.reads[i];
    int n=snprintf(text+len,sizeof(text)-(size_t)len,
      "%s{\"pid\":%d,\"op\":%d,\"rawReturn\":%d,\"errno\":%d,\"beginNs\":\"%llu\",\"endNs\":\"%llu\"}",
      i?",":"",r->pid,r->op,r->value,r->error,(unsigned long long)r->begin,(unsigned long long)r->end);
    if(n<0 || n>=(int)(sizeof(text)-(size_t)len)) return 74;
    len+=n;
  }
  if(len+3>=(int)sizeof(text)) return 74;
  int tail=snprintf(text+len,sizeof(text)-(size_t)len,
    "],\"rawPacketHex\":\"%s\",\"capturedAtNs\":\"%llu\",\"externalParentPid\":%d,\"externalBirthSec\":\"%llu\",\"externalBirthUsec\":\"%llu\"}\n",
    rawhex,(unsigned long long)capturedAt,owner,(unsigned long long)external.sec,(unsigned long long)external.usec);
  if(tail<0 || tail>=(int)(sizeof(text)-(size_t)len)) return 74;
  len+=tail;
  if(write(1,text,(size_t)len)!=len) return 74;
  return ok?0:70;
}
int main(int argc,char **argv) {
  if(argc>1 && !strcmp(argv[1],"--probe")) return probe(argc,argv);
  if(argc>1 && !strcmp(argv[1],"--supervise")) return supervise(argc,argv);
  return 64;
}
