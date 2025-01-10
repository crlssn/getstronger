output "hosted_zone_id" {
  description = "The ID of the hosted zone"
  value       = aws_route53_zone.hosted_zone.zone_id
}

output "api_record_fqdn" {
  description = "The FQDN of the API record"
  value       = aws_route53_record.api_record.fqdn
}

output "www_record_fqdn" {
  description = "The FQDN of the WWW record"
  value       = aws_route53_record.www_record.fqdn
}

output "ssh_record_fqdn" {
  description = "The FQDN of the SSH record"
  value       = aws_route53_record.ssh_record.fqdn
}
