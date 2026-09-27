#!/usr/bin/env ruby

require 'json'

file, task_id, base_sha, path = ARGV
exit 2 unless [file, task_id, base_sha, path].all?
exit 2 unless File.file?(file) && File.size(file).between?(1, 8192)

begin
  result = JSON.parse(File.read(file, encoding: 'UTF-8'))
rescue JSON::ParserError, ArgumentError
  exit 2
end

exit 2 unless result.is_a?(Hash)
expected_keys = %w[acceptance_sentinel base_master_sha file_path status task_id workspace_write_confirmed]
exit 2 unless result.keys.sort == expected_keys
exit 2 unless result['status'] == 'PASS'
exit 2 unless result['task_id'] == task_id
exit 2 unless result['base_master_sha'] == base_sha
exit 2 unless result['file_path'] == path
exit 2 unless result['workspace_write_confirmed'] == true
exit 2 unless result['acceptance_sentinel'] == 'CODEX_READY_BOOTSTRAP_PROOF=PASS'
