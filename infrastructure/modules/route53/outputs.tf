output "record_names" {
  description = "Names of standard DNS records created"
  value       = keys(aws_route53_record.records)
}

output "alias_names" {
  description = "Names of alias DNS records created"
  value       = keys(aws_route53_record.aliases)
}

output "ssl_record_names" {
  description = "Names of SSL validation DNS records created"
  value       = keys(aws_route53_record.ssl_records)
}

output "hosted_zone_id" {
  description = "ID of the Route 53 hosted zone"
  value       = aws_route53_zone.hosted_zone.zone_id
}