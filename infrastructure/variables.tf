variable "db_username" {
  description = "The username for the RDS instance"
  type        = string
}

variable "db_password" {
  description = "The password for the RDS instance"
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-west-2"
}
