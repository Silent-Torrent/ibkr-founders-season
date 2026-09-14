// Self-only macOS kernel-ledger capability control. Never a Worker/JS heap
// measurement. No memory query is made while the explicit pulse is mapped.
#include <errno.h>
#include <inttypes.h>
#include <libproc.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <time.h>
#include <unistd.h>

static void die(const char *operation) {
  perror(operation);
  exit(1);
}

static struct rusage_info_v4 usage(void) {
  struct rusage_info_v4 result = {0};
  if (proc_pid_rusage(getpid(), RUSAGE_INFO_V4, (rusage_info_t *)&result) != 0) die("self rusage");
  return result;
}

static uint64_t monotonic_ns(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) die("monotonic clock");
  return (uint64_t)ts.tv_sec * UINT64_C(1000000000) + (uint64_t)ts.tv_nsec;
}

int main(int argc, char **argv) {
  size_t mib;
  if (argc != 2) return 2;
  if (strcmp(argv[1], "0") == 0) mib = 0;
  else if (strcmp(argv[1], "32") == 0) mib = 32;
  else if (strcmp(argv[1], "64") == 0) mib = 64;
  else return 2; // No arbitrary PID, size, allocation mode or output path.
  const size_t bytes = mib * 1024 * 1024;
  const long page_size = sysconf(_SC_PAGESIZE);
  if (page_size <= 0 || (bytes && bytes % (size_t)page_size != 0)) return 3;
  (void)usage(); // Warm the query before the baseline.
  (void)monotonic_ns();
  const struct rusage_info_v4 before = usage();
  const uint64_t start = monotonic_ns();
  uint64_t checksum = 0;
  if (bytes) {
    void *mapping = mmap(NULL, bytes, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANON, -1, 0);
    if (mapping == MAP_FAILED) die("mmap");
    volatile unsigned char *touch = mapping;
    for (size_t offset = 0; offset < bytes; offset += (size_t)page_size) {
      touch[offset] = 0x5a;
      checksum += touch[offset];
    }
    if (munmap(mapping, bytes) != 0) die("munmap");
  }
  const uint64_t end = monotonic_ns();
  const struct rusage_info_v4 after = usage();
  if (after.ri_proc_start_abstime != before.ri_proc_start_abstime ||
      after.ri_lifetime_max_phys_footprint < before.ri_lifetime_max_phys_footprint ||
      before.ri_lifetime_max_phys_footprint < before.ri_phys_footprint ||
      after.ri_lifetime_max_phys_footprint < after.ri_phys_footprint || end < start) return 4;
  // All output/formatting occurs after the final query. The process start
  // counter is a decimal string so JSON consumers cannot lose identity bits.
  printf("{\"scope\":\"self-process-physical-footprint-ledger\","
         "\"pid\":%d,\"processStartAbstime\":\"%" PRIu64 "\","
         "\"requestedBytes\":%zu,\"pageBytes\":%ld,\"touchedPages\":%zu,"
         "\"checksum\":%" PRIu64 ",\"pulseDurationNs\":%" PRIu64 ","
         "\"beforeCurrentBytes\":%" PRIu64 ",\"beforeLifetimePeakBytes\":%" PRIu64 ","
         "\"afterCurrentBytes\":%" PRIu64 ",\"afterLifetimePeakBytes\":%" PRIu64 ","
         "\"queriedDuringPulse\":false,\"workerAttributionProven\":false,"
         "\"javascriptHeapPeakMeasured\":false,\"deviceThresholdEstablished\":false}\n",
         getpid(), before.ri_proc_start_abstime, bytes, page_size, bytes / (size_t)page_size,
         checksum, end - start, before.ri_phys_footprint, before.ri_lifetime_max_phys_footprint,
         after.ri_phys_footprint, after.ri_lifetime_max_phys_footprint);
  return 0;
}
