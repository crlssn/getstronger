provider "aws" {
  region = "eu-west-2"
}

resource "aws_db_instance" "db" {
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

  # VPC & Subnet group settings
  db_subnet_group_name = aws_db_subnet_group.default.name
  publicly_accessible  = true # Set to true if you need public access

  # Security group settings
  vpc_security_group_ids = [aws_security_group.default.id]
}

# Optional: Create a DB subnet group if you don't have one already
resource "aws_db_subnet_group" "default" {
  name       = "db-subnet-group"
  subnet_ids = ["subnet-0977de5206e697577", "subnet-040d4c7a3aaa9a63d", "subnet-0cf0e0b715c1ec540"] # Replace with your subnet IDs

  tags = {
    Name = "My DB subnet group"
  }
}

# Optional: Create a security group if you don't have one already
resource "aws_security_group" "default" {
  name        = "db-security-group"
  description = "Allow DB access"
  vpc_id      = "vpc-016eba058ed193190" # Replace with your VPC ID

  ingress {
    from_port   = 5432 # PostgreSQL default port
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Allow access from anywhere
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "My DB security group"
  }
}
