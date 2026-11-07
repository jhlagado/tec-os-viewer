/* STOP_BEFORE_FORK_V1. No target code, fork, setsid or target-file read before
 * the inherited-group stop. Only the broker's owned-group CONT may resume it.
 * The source-sealed argv is supplied by the coordinator-signed lease. */
#include <signal.h>
#include <stdio.h>
#include <unistd.h>
int main(int argc, char **argv) {
  if (argc < 2 || argv[1][0] != '/') return 64;
  if (raise(SIGSTOP)) return 70;
  execv(argv[1], argv + 1);
  perror("sealed bootstrap exec");
  return 127;
}
