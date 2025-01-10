variable "log_group_name" {}
variable "retention_days" {
  default = 30
}

variable "role_name" {}
variable "policy_name" {}
variable "instance_profile_name" {}
variable "assume_role_policy" {
  description = "The assume role policy for the IAM role"
  default = <<EOT
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOT
}

