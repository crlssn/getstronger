resource "aws_instance" "ec2_instance" {
  ami                  = var.ami
  instance_type        = var.instance_type
  security_group_names = [aws_security_group.ssh_access.name, aws_security_group.api_access.name]
  key_name             = aws_key_pair.ec2_key.key_name
  iam_instance_profile = var.iam_instance_profile

  user_data = var.user_data
}

resource "aws_key_pair" "ec2_key" {
  key_name   = var.key_name
  public_key = var.public_key
}

resource "aws_security_group" "ssh_access" {
  name        = var.ssh_security_group_name
  description = var.ssh_security_group_description

  ingress {
    description = "SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_ingress_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api_access" {
  name        = var.api_security_group_name
  description = var.api_security_group_description

  ingress {
    description = "Allow HTTP traffic"
    from_port   = var.api_http_port
    to_port     = var.api_http_port
    protocol    = "tcp"
    cidr_blocks = var.api_ingress_cidr_blocks
  }

  ingress {
    description = "Allow HTTPS traffic"
    from_port   = var.api_https_port
    to_port     = var.api_https_port
    protocol    = "tcp"
    cidr_blocks = var.api_ingress_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
