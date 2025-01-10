module "cloudwatch" {
  source = "./modules/cloudwatch"

  log_group_name        = "/aws/backend-service/logs"
  retention_days        = 30
  role_name             = "ec2-cloudwatch-role"
  policy_name           = "cloudwatch-logs-policy"
  instance_profile_name = "ec2-cloudwatch-instance-profile"
}

module "db" {
  source = "./modules/db"

  allocated_storage          = 20
  storage_type               = "gp2"
  engine                     = "postgres"
  engine_version             = "16.4"
  instance_class             = "db.t3.micro"
  db_name                    = "getstronger"
  username                   = var.db_username
  password                   = var.db_password
  parameter_group_name       = "default.postgres16"
  skip_final_snapshot        = true
  identifier                 = "getstronger"
  publicly_accessible        = true
  security_group_name        = "db-access"
  security_group_description = "Allow public access to RDS instance"
  db_port                    = 5432
  ingress_cidr_blocks        = ["0.0.0.0/0"] # DEBT: Replace with specific IP ranges for better security.
}

module "ec2" {
  source = "./modules/ec2"

  ami                  = "ami-02f617729751b375a"
  instance_type        = "t2.micro"
  iam_instance_profile = module.cloudwatch.instance_profile_name
  user_data            = file("scripts/cloudwatch.sh")

  key_name   = "backend-ec2-key"
  public_key = var.ec2_public_key

  ssh_security_group_name        = "allow_ssh"
  ssh_security_group_description = "Allow SSH inbound traffic"
  ssh_ingress_cidr_blocks        = ["0.0.0.0/0"]

  api_security_group_name        = "allow_api_access"
  api_security_group_description = "Allow inbound traffic to API"
  api_https_port                 = 443
  api_ingress_cidr_blocks        = ["0.0.0.0/0"]
}

module "route53" {
  source = "./modules/route53"

  domain                            = "getstronger.pro"
  api_record_ip                     = module.ec2.public_ip
  api_record_ttl                    = 300
  cloudfront_alias_name             = aws_cloudfront_distribution.www_getstronger_pro_distribution.domain_name
  cloudfront_alias_zone_id          = aws_cloudfront_distribution.www_getstronger_pro_distribution.hosted_zone_id
  cloudfront_evaluate_target_health = false
  ssh_record_ip                     = module.ec2.public_ip
  ssh_record_ttl                    = 300
  ec2_instance_id                   = module.ec2.instance_id
}

module "ses" {
  source = "./modules/ses"

  domain               = var.domain
  zone_id              = module.route53.hosted_zone_id
  region               = var.aws_region
  account_id           = "205930632120"
  user_name            = "ses_user_getstronger_pro"
  cloudwatch_role_name = module.cloudwatch.role_name
}
