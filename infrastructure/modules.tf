module "cloudwatch" {
  source                = "./modules/cloudwatch"
  log_group_name        = "/aws/backend-service/logs"
  retention_days        = 30
  role_name             = "ec2-cloudwatch-role"
  policy_name           = "cloudwatch-logs-policy"
  instance_profile_name = "ec2-cloudwatch-instance-profile"
}
