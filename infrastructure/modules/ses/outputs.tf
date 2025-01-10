output "access_key_id" {
  description = "The access key ID for the SES user"
  value       = aws_iam_access_key.ses_user_key.id
  sensitive   = true
}

output "secret_access_key" {
  description = "The secret access key for the SES user"
  value       = aws_iam_access_key.ses_user_key.secret
  sensitive   = true
}

output "dkim_records" {
  description = "DKIM validation records for SES"
  value       = aws_route53_record.dkim[*].fqdn
}

output "spf_record" {
  description = "SPF record for SES"
  value       = aws_route53_record.spf.name
}

output "mx_records" {
  description = "MX records for SES"
  value       = aws_route53_record.mx.records
}

output "verification_record" {
  description = "SES verification record"
  value       = aws_route53_record.ses_verification.fqdn
}
