output "ses_access_key" {
  value       = aws_iam_access_key.ses_user_key.id
  description = "Access Key ID for SES user"
  sensitive   = true
}

output "ses_secret_key" {
  value       = aws_iam_access_key.ses_user_key.secret
  description = "Secret Access Key for SES user"
  sensitive   = true
}
