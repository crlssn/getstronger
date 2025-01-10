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

moved {
  from = aws_ses_domain_identity.getstronger
  to   = module.ses.aws_ses_domain_identity.ses_domain
}

moved {
  from = aws_route53_record.ses_verification
  to   = module.ses.aws_route53_record.ses_verification
}

moved {
  from = aws_ses_domain_dkim.getstronger
  to   = module.ses.aws_ses_domain_dkim.ses_dkim
}

moved {
  from = aws_route53_record.dkim
  to   = module.ses.aws_route53_record.dkim
}

moved {
  from = aws_route53_record.spf
  to   = module.ses.aws_route53_record.spf
}

moved {
  from = aws_route53_record.mx_record
  to   = module.ses.aws_route53_record.mx
}

moved {
  from = aws_iam_policy.ses_send_email
  to   = module.ses.aws_iam_policy.ses_send_email
}

moved {
  from = aws_iam_user.ses_user
  to   = module.ses.aws_iam_user.ses_user
}

moved {
  from = aws_iam_user_policy_attachment.ses_policy_attach
  to   = module.ses.aws_iam_user_policy_attachment.ses_policy_attach
}

moved {
  from = aws_iam_access_key.ses_user_key
  to   = module.ses.aws_iam_access_key.ses_user_key
}

moved {
    from = aws_iam_role_policy_attachment.ses_policy_cloudwatch
    to   = module.ses.aws_iam_role_policy_attachment.cloudwatch
}
