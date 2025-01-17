moved {
  from = module.s3.aws_s3_bucket_policy.bucket_policy
  to   = aws_s3_bucket_policy.public_access
}

moved {
  from = module.s3.aws_s3_bucket_public_access_block.public_access
  to   = aws_s3_bucket_public_access_block.public_access_block
}

moved {
  from = module.s3.aws_s3_bucket_website_configuration.website
  to   = aws_s3_bucket_website_configuration.vue_js_bucket
}

moved {
  from = module.s3.aws_s3_bucket.bucket
  to   = aws_s3_bucket.www_getstronger_pro
}

moved {
  from = module.route53.aws_eip.ec2_instance
  to   = aws_eip.ec2_instance
}

moved {
  from = module.route53.aws_route53_record.ssh_record
  to   = aws_route53_record.ssh_getstronger_pro
}

moved {
  from = module.route53.aws_route53_record.www_record
  to   = aws_route53_record.www_getstronger_pro
}

moved {
  from = module.route53.aws_route53_record.api_record
  to   = aws_route53_record.api_getstronger_pro
}

moved {
  from = module.route53.aws_route53_zone.hosted_zone
  to   = aws_route53_zone.getstronger_pro
}

moved {
  from = module.ses.aws_iam_role_policy_attachment.cloudwatch
  to   = aws_iam_role_policy_attachment.ses_policy_cloudwatch
}

moved {
  from = module.ses.aws_iam_access_key.ses_user_key
  to   = aws_iam_access_key.ses_user_key
}

moved {
  from = module.ses.aws_iam_user_policy_attachment.ses_policy_attach
  to   = aws_iam_user_policy_attachment.ses_policy_attach
}

moved {
  from = module.ses.aws_iam_user.ses_user
  to   = aws_iam_user.ses_user
}

moved {
  from = module.ses.aws_iam_policy.ses_send_email
  to   = aws_iam_policy.ses_send_email
}

moved {
  from = module.ses.aws_route53_record.mx
  to   = aws_route53_record.mx_record
}

moved {
  from = module.ses.aws_route53_record.spf
  to   = aws_route53_record.spf
}

moved {
  from = module.ses.aws_route53_record.dkim
  to   = aws_route53_record.dkim
}

moved {
  from = module.ses.aws_ses_domain_dkim.ses_dkim
  to   = aws_ses_domain_dkim.getstronger
}

moved {
  from = module.ses.aws_route53_record.ses_verification
  to   = aws_route53_record.ses_verification
}

moved {
  from = module.ses.aws_ses_domain_identity.ses_domain
  to   = aws_ses_domain_identity.getstronger
}

moved {
  from = module.ec2.aws_security_group.api_access
  to   = aws_security_group.api_access
}

moved {
  from = module.ec2.aws_security_group.ssh_access
  to   = aws_security_group.ssh_access
}

moved {
  from = module.ec2.aws_key_pair.ec2_key
  to   = aws_key_pair.backend_ec2_key
}

moved {
  from = module.ec2.aws_instance.ec2_instance
  to   = aws_instance.backend
}

moved {
  from = module.db.aws_security_group.db_access
  to   = aws_security_group.db_access
}

moved {
  from = module.db.aws_db_instance.db_instance
  to   = aws_db_instance.postgres
}

moved {
  from = module.cloudwatch.aws_iam_instance_profile.instance_profile
  to   = aws_iam_instance_profile.ec2_instance_profile
}

moved {
  from = module.cloudwatch.aws_iam_role_policy_attachment.policy_attachment
  to   = aws_iam_role_policy_attachment.attach_policy
}

moved {
  from = module.cloudwatch.aws_iam_policy.log_policy
  to   = aws_iam_policy.cloudwatch_logs_policy
}

moved {
  from = module.cloudwatch.aws_iam_role.role
  to   = aws_iam_role.ec2_cloudwatch_role
}

moved {
  from = module.cloudwatch.aws_cloudwatch_log_group.log_group
  to   = aws_cloudwatch_log_group.backend_logs
}
