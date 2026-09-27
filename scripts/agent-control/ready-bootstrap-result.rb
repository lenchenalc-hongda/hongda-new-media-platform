#!/usr/bin/env ruby

require 'json'

file, task_id, base_sha, path = ARGV
exit 2 unless [file, task_id, base_sha, path].all?
exit 2 unless File.file?(file) && File.size(file).between?(1, 8192)

begin
  raw = File.read(file, encoding: 'UTF-8')
  result = JSON.parse(raw)
rescue JSON::ParserError, ArgumentError
  exit 2
end

exit 2 unless result.is_a?(Hash)
expected_keys = %w[acceptance_sentinel base_master_sha file_path status task_id workspace_write_confirmed]

# JSON.parse keeps the last value of a duplicate key. Walk valid JSON strings at
# the top object level and reject repeated keys before trusting parsed values.
keys = []
depth = 0
in_string = false
escaped = false
string_start = nil
raw.each_char.with_index do |character, index|
  if in_string
    if escaped
      escaped = false
    elsif character == '\\'
      escaped = true
    elsif character == '"'
      in_string = false
      if depth == 1 && raw[(index + 1)..].match?(/\A\s*:/)
        keys << JSON.parse(raw[string_start..index])
      end
    end
  elsif character == '"'
    in_string = true
    string_start = index
  elsif character == '{' || character == '['
    depth += 1
  elsif character == '}' || character == ']'
    depth -= 1
  end
end

exit 2 unless keys.sort == expected_keys
exit 2 unless result.keys.sort == expected_keys
exit 2 unless result['status'] == 'PASS'
exit 2 unless result['task_id'] == task_id
exit 2 unless result['base_master_sha'] == base_sha
exit 2 unless result['file_path'] == path
exit 2 unless result['workspace_write_confirmed'] == true
exit 2 unless result['acceptance_sentinel'] == 'CODEX_READY_BOOTSTRAP_PROOF=PASS'
