variable "db_username" {
  description = "The username for the RDS instance"
  type        = string
}

variable "db_password" {
  description = "The password for the RDS instance"
  type        = string
  sensitive   = true
}

variable "bucket_name" {
  description = "The name of the S3 bucket"
  type        = string
  default     = "vue-js-app"
}

variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-west-2"
}

variable "domain" {
  default = "getstronger.pro"
}

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
