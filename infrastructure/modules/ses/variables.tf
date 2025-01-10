variable "domain" {
  description = "The domain to configure for SES"
  type        = string
}

variable "zone_id" {
  description = "The Route 53 hosted zone ID for the domain"
  type        = string
}

variable "region" {
  description = "The AWS region where SES is configured"
  type        = string
  default     = "eu-west-2"
}

variable "account_id" {
  description = "The AWS account ID"
  type        = string
}

variable "user_name" {
  description = "The name of the IAM user for SES"
  type        = string
  default     = "ses_user"
}
