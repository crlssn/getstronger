resource "aws_db_instance" "postgres" {
  allocated_storage    = 20                   # Minimum required storage in GB
  storage_type         = "gp2"                # General Purpose SSD
  engine               = "postgres"           # Specifies the database engine as PostgreSQL
  engine_version       = "16.4"               # PostgreSQL version 16.4
  instance_class       = "db.t3.micro"        # Smallest instance type available
  db_name              = "getstronger"        # Name of your database
  username             = var.db_username      # Master username
  password             = var.db_password      # Master password
  parameter_group_name = "default.postgres16" # Parameter group for PostgreSQL 16
  skip_final_snapshot  = true                 # Skips the final snapshot on deletion
  identifier           = "getstronger"        # Unique identifier for the DB instance

  # VPC & Subnet group settings
  publicly_accessible = true # Set to true if you need public access

  # Security group settings
  vpc_security_group_ids = [aws_security_group.db_access.id]
}

resource "aws_security_group" "db_access" {
  name        = "db-access"
  description = "Allow public access to RDS instance"

  ingress {
    from_port   = 5432 # Adjust based on your database engine
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Allow public access (Use specific IP ranges for security)
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

