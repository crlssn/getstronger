terraform {
  required_version = ">= 1.2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }
}

# State migrations.
moved {
  from = "aws_cloudwatch_log_group.backend_logs"
  to   = "aws_cloudwatch_log_group.log_group"
}

moved {
  from = "aws_iam_role.ec2_cloudwatch_role"
  to   = "aws_iam_role.role"
}

moved {
  from = "aws_iam_policy.cloudwatch_logs_policy"
  to   = "aws_iam_policy.log_policy"
}

moved {
  from = "aws_iam_role_policy_attachment.attach_policy"
  to   = "aws_iam_role_policy_attachment.policy_attachment"
}

moved {
  from = "aws_iam_instance_profile.ec2_instance_profile"
  to   = "aws_iam_instance_profile.instance_profile"
}
