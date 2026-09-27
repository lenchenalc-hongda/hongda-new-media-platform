#!/usr/bin/env ruby

require 'json'

mode = ARGV[0]

case mode
when 'draft-pr'
  title, head, base, body_path = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
  exit 2 if [title, head, base, body_path].any?(&:nil?)

  body = File.read(body_path, encoding: 'UTF-8')
  payload = {
    'title' => title,
    'head' => head,
    'base' => base,
    'draft' => true,
    'body' => body
  }
when 'comment'
  body_path = ARGV[1]
  exit 2 if body_path.nil?

  body = File.read(body_path, encoding: 'UTF-8')
  payload = { 'body' => body }
else
  exit 2
end

STDOUT.write(JSON.generate(payload))
