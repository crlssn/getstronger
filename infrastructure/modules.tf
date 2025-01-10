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
