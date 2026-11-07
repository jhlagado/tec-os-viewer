/* Source-only candidate. This process directly parents every private anchor.
 * It NEVER reaps an anchor until its session has been observed empty of live
 * members. SIGCHLD retains normal waitable semantics. No numeric signal API.
 * WNOWAIT declaration: installed Darwin SDK sys/wait.h, XSI interface. */
#define main identity_reader_entry
#include "darwin-identity.c"
#undef main
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/time.h>
#include <mach/mach_time.h>

#define GROUPS 32
#define FRAME 65536
typedef struct {
  char token[65]; pid_t anchor; int phase, retired;
  uint64_t sec, usec;
} owned;
static owned groups[GROUPS]; static int count, closing, unknown_state;
static uint64_t started_ns, grace_ns, term_ns, kill_ns, final_ns;
static char capability[65];
static uint64_t clock_ns(void) {
  mach_timebase_info_data_t tb;
  if(mach_timebase_info(&tb) || !tb.denom) _exit(70);
  return (uint64_t)(((__uint128_t)mach_continuous_time()*tb.numer)/tb.denom);
}
static int hex_token(const char *s) {
  if(strlen(s)!=64) return 0;
  for(int i=0;i<64;i++) if(!((s[i]>='0'&&s[i]<='9')||(s[i]>='a'&&s[i]<='f'))) return 0;
  return 1;
}
static owned *lookup(const char *token) {
  for(int i=0;i<count;i++) if(!strcmp(groups[i].token,token)) return &groups[i];
  return NULL;
}
static int retained(owned *g) {
  /* This is a direct-child kernel wait query, NOT check-birth then kill.
   * No code path waits/reaps this child before retirement. Even if it exits
   * between here and signal, its PID remains allocated to the same child. */
  siginfo_t info; memset(&info,0,sizeof(info));
  if(g->retired || g->anchor<2 || waitid(P_PID,(id_t)g->anchor,&info,WEXITED|WNOHANG|WNOWAIT)<0) return 0;
  return 1;
}
static int signal_owned(owned *g, int sig) {
  if(!retained(g)) { unknown_state=1; return -1; }
  /* Only a broker-created, acknowledged setsid anchor owns this number.
   * Retained live/zombie child pins PID=SID=PGID; no outside session may join.
   * No PID, PGID, executable name or caller-provided integer is accepted. */
  if(g->phase<2) return kill(g->anchor,sig); /* directly retained pre-setsid child */
  int r=kill(-g->anchor,sig);
  if(r && errno==ESRCH) return 0; /* delivery absence is NOT retirement proof */
  return r;
}
static void stop_all(int sig) {
  closing=1;
  for(int i=0;i<count;i++) if(!groups[i].retired && signal_owned(&groups[i],sig)) unknown_state=1;
}
static int stopped_child(pid_t p, uint64_t deadline) {
  for(;;) {
    siginfo_t info; memset(&info,0,sizeof(info));
    if(waitid(P_PID,(id_t)p,&info,WSTOPPED|WEXITED|WNOHANG|WNOWAIT)<0) return -1;
    if(info.si_pid==p) {
      if(info.si_code!=CLD_STOPPED || info.si_status!=SIGSTOP) return -1;
      /* Consume ONLY the stop notification. WEXITED is deliberately absent,
       * so an exit racing this call cannot reap the retained anchor. */
      memset(&info,0,sizeof(info));
      if(waitid(P_PID,(id_t)p,&info,WSTOPPED|WNOHANG)<0 || info.si_pid!=p ||
         info.si_code!=CLD_STOPPED || info.si_status!=SIGSTOP) return -1;
      return 0;
    }
    if(clock_ns()>=deadline) return -1;
    struct timespec tick={0,1000000}; nanosleep(&tick,NULL);
  }
}
static void execute_plan(const char *path) {
  /* NUL-delimited absolute executable + argv, terminated by a final empty
   * string. Plans are private immutable source-sealed coordinator outputs. */
  int fd=open(path,O_RDONLY|O_NOFOLLOW|O_CLOEXEC); char data[FRAME]; struct stat st;
  if(fd<0 || fstat(fd,&st) || !S_ISREG(st.st_mode) || st.st_uid!=getuid() ||
      (st.st_mode&0077) || st.st_size<3 || st.st_size>=FRAME) _exit(70);
  size_t used=0; ssize_t n;
  while((n=read(fd,data+used,sizeof(data)-used))>0) { used+=(size_t)n; if(used>=sizeof(data)) _exit(70); }
  close(fd);
  if(n<0 || used!=(size_t)st.st_size || data[used-1] || data[used-2]) _exit(70);
  char *args[130]; int argc=0; size_t at=0;
  while(at<used-1 && data[at]) {
    if(argc>=128) _exit(70); args[argc++]=data+at;
    size_t len=strnlen(data+at,used-at); if(len>=used-at) _exit(70); at+=len+1;
  }
  args[argc]=NULL;
  if(!argc || args[0][0]!='/') _exit(70);
  execv(args[0],args); _exit(127);
}
static int create_group(const char *token,const char *plan) {
  if(closing || count==GROUPS || !hex_token(token) || lookup(token) || plan[0]!='/') return -1;
  owned *g=&groups[count++]; memset(g,0,sizeof(*g)); strcpy(g->token,token);
  pid_t child=fork();
  if(child<0) { count--; unknown_state=closing=1; return -1; }
  if(!child) {
    raise(SIGSTOP); /* broker owns retained direct child before setsid */
    if(setsid()<0) _exit(70);
    raise(SIGSTOP); /* session acknowledged before any worker */
    pid_t worker=fork(); if(worker<0) _exit(70);
    if(!worker) { raise(SIGSTOP); execute_plan(plan); }
    /* Worker stays stopped until a dual-ack controller authorizes group CONT.
     * The anchor reaps only this worker, but NEVER exits on worker outcome.
     * The broker retains the anchor itself unreaped until retirement. */
    for(;;) {
      int status; (void)waitpid(worker,&status,WNOHANG); /* worker, NEVER anchor */
      struct timespec tick={0,10000000}; nanosleep(&tick,NULL);
    }
  }
  g->anchor=child; g->phase=0;
  if(stopped_child(child,clock_ns()+150000000)) { unknown_state=closing=1; return -1; }
  struct proc_bsdinfo b;
  if(!bsd(child,&b)) { unknown_state=closing=1; return -1; }
  g->sec=b.pbi_start_tvsec; g->usec=b.pbi_start_tvusec; g->phase=1;
  return 0;
}
static int transition(owned *g) {
  if(closing || !retained(g)) return -1;
  if(g->phase==1) {
    if(kill(g->anchor,SIGCONT) || stopped_child(g->anchor,clock_ns()+150000000)) return -1;
    struct proc_bsdinfo b;
    if(!bsd(g->anchor,&b) || b.pbi_start_tvsec!=g->sec || b.pbi_start_tvusec!=g->usec ||
       b.pbi_pgid!=(uint32_t)g->anchor || getsid(g->anchor)!=g->anchor) return -1;
    g->phase=2; return 0;
  }
  if(g->phase==2) { g->phase=3; return signal_owned(g,SIGCONT); }
  if(g->phase==3) return signal_owned(g,SIGCONT);
  return -1;
}
static int session_empty(owned *g) {
  uint64_t until=clock_ns()+150000000;
  pid_t pids[MAX_PIDS]; int n=proc_listallpids(pids,sizeof(pids));
  if(n<=0 || n>=MAX_PIDS) return -1;
  for(int i=0;i<n;i++) if(pids[i]>1 && pids[i]!=g->anchor) {
    if(clock_ns()>=until) return -1;
    struct proc_bsdinfo b;
    if(!bsd(pids[i],&b)) continue;
    pid_t sid=getsid(pids[i]); if(sid<0) return -1;
    if(sid==g->anchor) return 0; /* includes zombies: no disappearance claim */
  }
  return 1;
}
static int retire(owned *g) {
  if(!closing || !retained(g) || session_empty(g)!=1) return -1;
  siginfo_t info; memset(&info,0,sizeof(info));
  if(waitid(P_PID,(id_t)g->anchor,&info,WEXITED|WNOHANG|WNOWAIT)<0 || info.si_pid!=g->anchor) return -1;
  int status;
  g->retired=1; /* invalidate before exact reap; failure NEVER restores token */
  if(waitpid(g->anchor,&status,WNOHANG)!=g->anchor) { unknown_state=1; return -1; }
  return 0; /* only anchor reap in broker; no further signals for token */
}
static int frame(int fd,char *out,size_t size,uint64_t deadline) {
  size_t used=0;
  while(used<size-1) {
    if(clock_ns()>=deadline) return -1;
    struct pollfd p={fd,POLLIN,0}; int ms=(int)((deadline-clock_ns())/1000000)+1;
    if(ms<1) return -1;
    int r=poll(&p,1,ms); if(r<0 && errno==EINTR) continue; if(r!=1) return -1;
    ssize_t n=read(fd,out+used,1); if(n<0 && (errno==EINTR || errno==EAGAIN)) continue;
    if(n!=1) return -1;
    if(out[used++]=='\n') { out[used-1]=0; return 0; }
  }
  return -1;
}
static void serve(int fd) {
  char line[FRAME], auth[65], op[24], token[65], plan[4096];
  uid_t uid; gid_t gid;
  if(getpeereid(fd,&uid,&gid) || uid!=getuid() || frame(fd,line,sizeof(line),clock_ns()+150000000)) return;
  int fields=sscanf(line,"%64s %23s %64s %4095s",auth,op,token,plan);
  if(fields<2 || strcmp(auth,capability)) return;
  int result=-1; owned *g=fields>=3?lookup(token):NULL;
  if(!strcmp(op,"CREATE") && fields==4) { result=create_group(token,plan); g=lookup(token); }
  /* No raw capability-only continuation. The admitted executable candidate
   * is root.py, whose verifier checks BOTH durable generation-bound receipts.
   * This native source unit is inspection/termination-only, not a second
   * less-strict workload launcher. */
  else if(!strcmp(op,"CONT") && g) result=-1;
  else if(!strcmp(op,"TERM") && g) { closing=1; result=signal_owned(g,SIGTERM); }
  else if(!strcmp(op,"KILL") && g) { closing=1; result=signal_owned(g,SIGKILL); }
  else if(!strcmp(op,"STOP")) { stop_all(SIGKILL); result=0; }
  else if(!strcmp(op,"RETIRE") && g) result=retire(g);
  else if(!strcmp(op,"STATUS")) result=0;
  else if(!strcmp(op,"EXIT")) {
    result=0;
    for(int i=0;i<count;i++) if(!groups[i].retired) result=-1;
    if(!result) { dprintf(fd,"{\"ok\":true,\"brokerExit\":true}\n"); exit(unknown_state?70:0); }
  }
  char reply[8192]; size_t at=(size_t)snprintf(reply,sizeof(reply),"{\"ok\":%s,\"unknown\":%s,\"closing\":%s,\"groups\":[",result?"false":"true",unknown_state?"true":"false",closing?"true":"false");
  for(int i=0;i<count;i++) at+=(size_t)snprintf(reply+at,sizeof(reply)-at,"%s{\"token\":\"%s\",\"anchor\":%d,\"phase\":%d,\"retired\":%s}",i?",":"",groups[i].token,groups[i].anchor,groups[i].phase,groups[i].retired?"true":"false");
  if(at+4>=sizeof(reply)) { unknown_state=closing=1; return; }
  memcpy(reply+at,"]}\n",4); at+=3;
  /* Nonblocking bounded reply. Failure is unknown, never permission to launch. */
  uint64_t end=clock_ns()+150000000; size_t sent=0;
  while(sent<at && clock_ns()<end) {
    ssize_t n=write(fd,reply+sent,at-sent);
    if(n>0) sent+=(size_t)n;
    else if(errno!=EAGAIN && errno!=EINTR) break;
  }
  if(sent!=at) unknown_state=closing=1;
}
int main(int argc,char **argv) {
  if((argc==3&&!strcmp(argv[1],"identity")) || (argc==2&&!strcmp(argv[1],"table"))) return identity_reader_entry(argc,argv);
  if(argc!=6 || strcmp(argv[1],"serve") || !hex_token(argv[3])) return 64;
  char *end; started_ns=strtoull(argv[5],&end,10);
  if(!*argv[5] || *end || !started_ns || started_ns>clock_ns()) return 64;
  strcpy(capability,argv[3]); /* inherited whole-job T0; never reset at startup */
  int synthetic=!strcmp(argv[4],"synthetic");
  if(!synthetic && strcmp(argv[4],"real")) return 64;
  grace_ns=(uint64_t)(synthetic?2:110)*1000000000;
  term_ns=(uint64_t)(synthetic?3:115)*1000000000;
  kill_ns=(uint64_t)(synthetic?4:118)*1000000000;
  final_ns=(uint64_t)(synthetic?5:120)*1000000000;
  signal(SIGPIPE,SIG_IGN); /* preserve normal SIGCHLD; never auto-reap */
  struct sigaction child_action; memset(&child_action,0,sizeof(child_action));
  child_action.sa_handler=SIG_DFL; sigemptyset(&child_action.sa_mask);
  if(sigaction(SIGCHLD,&child_action,NULL)) return 70; /* no SA_NOCLDWAIT */
  int listener=socket(AF_UNIX,SOCK_STREAM,0); struct sockaddr_un addr; memset(&addr,0,sizeof(addr));
  addr.sun_family=AF_UNIX;
  if(strlen(argv[2])>=sizeof(addr.sun_path)) return 64; strcpy(addr.sun_path,argv[2]);
  umask(0077);
  if(listener<0 || bind(listener,(struct sockaddr *)&addr,sizeof(addr)) || listen(listener,8)) return 70;
  fcntl(listener,F_SETFL,O_NONBLOCK);
  int term_sent=0,kill_sent=0;
  for(;;) {
    uint64_t elapsed=clock_ns()-started_ns;
    if(elapsed>=grace_ns) closing=1;
    if(elapsed>=term_ns && !term_sent) { stop_all(SIGTERM); term_sent=1; }
    if(elapsed>=kill_ns && !kill_sent) { stop_all(SIGKILL); kill_sent=1; }
    if(elapsed>=final_ns) { closing=1; stop_all(SIGKILL); }
    if(elapsed>=final_ns+1000000000ULL) return 70; /* bounded UNKNOWN handoff,
      * no cleanup claim, caller retains reservation and precise registry */
    struct pollfd p={listener,POLLIN,0};
    int r=poll(&p,1,10);
    if(r>0) {
      int fd=accept(listener,NULL,NULL);
      if(fd>=0) { fcntl(fd,F_SETFL,O_NONBLOCK); serve(fd); close(fd); }
    } else if(r<0 && errno!=EINTR) { unknown_state=1; stop_all(SIGKILL); }
  }
}
