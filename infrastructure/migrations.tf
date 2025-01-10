moved {
  from = aws_cloudwatch_log_group.backend_logs
  to   = module.cloudwatch.aws_cloudwatch_log_group.log_group
}

moved {
  from = aws_iam_role.ec2_cloudwatch_role
  to   = module.cloudwatch.aws_iam_role.role
}

moved {
  from = aws_iam_policy.cloudwatch_logs_policy
  to   = module.cloudwatch.aws_iam_policy.log_policy
}

moved {
  from = aws_iam_role_policy_attachment.attach_policy
  to   = module.cloudwatch.aws_iam_role_policy_attachment.policy_attachment
}

moved {
  from = aws_iam_instance_profile.ec2_instance_profile
  to   = module.cloudwatch.aws_iam_instance_profile.instance_profile
}

moved {
  from = aws_db_instance.postgres
  to   = module.db.aws_db_instance.db_instance
}

moved {
  from = aws_security_group.db_access
  to   = module.db.aws_security_group.db_access
}

moved {
  from = aws_instance.backend
  to   = module.ec2.aws_instance.ec2_instance
}

moved {
  from = aws_key_pair.backend_ec2_key
  to   = module.ec2.aws_key_pair.ec2_key
}

moved {
  from = aws_security_group.ssh_access
  to   = module.ec2.aws_security_group.ssh_access
}

moved {
  from = aws_security_group.api_access
  to   = module.ec2.aws_security_group.api_access
}
