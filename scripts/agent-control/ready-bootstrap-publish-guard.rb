#!/usr/bin/env ruby

expected_sha, actual_sha = ARGV[0], ARGV[1]
sha_pattern = /\A[0-9a-f]{40}\z/

exit 2 unless expected_sha&.match?(sha_pattern)
exit 2 unless actual_sha&.match?(sha_pattern)

exit(expected_sha == actual_sha ? 0 : 3)
