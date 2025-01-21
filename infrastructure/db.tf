resource "aws_db_instance" "postgres" {
  allocated_storage               = 20
  storage_type                    = "gp2"
  engine                          = "postgres"
  engine_version                  = "16.4"
  instance_class                  = "db.t3.micro"
  db_name                         = "getstronger"
  username                        = var.db_username
  password                        = var.db_password
  parameter_group_name            = "default.postgres16"
  skip_final_snapshot             = true
  publicly_accessible             = true
  vpc_security_group_ids          = [aws_security_group.db_access.id]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring_role.arn
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

resource "aws_security_group" "db_access" {
  name        = "db-access"
  description = "Allow public access to RDS instance"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # DEBT: Replace with specific IP ranges for better security.
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role" "rds_monitoring_role" {
  name = "rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "rds_monitoring_policy" {
  name        = "rds-monitoring-policy"
  description = "Policy for RDS Enhanced Monitoring"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "cloudwatch:PutMetricData",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_rds_monitoring_policy" {
  role       = aws_iam_role.rds_monitoring_role.name
  policy_arn = aws_iam_policy.rds_monitoring_policy.arn
}
