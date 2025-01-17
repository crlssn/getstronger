resource "aws_instance" "backend" {
  ami                  = "ami-02f617729751b375a"
  instance_type        = "t2.micro"
  security_groups      = [aws_security_group.ssh_access.name, aws_security_group.api_access.name]
  key_name             = aws_key_pair.backend_ec2_key.key_name
  iam_instance_profile = aws_iam_instance_profile.ec2_instance_profile.name
  user_data            = file("scripts/cloudwatch.sh")
}

resource "aws_key_pair" "backend_ec2_key" {
  key_name   = "backend-ec2-key"
  public_key = var.ec2_public_key
}

resource "aws_security_group" "ssh_access" {
  name        = "allow_ssh"
  description = "Allow SSH inbound traffic"

  ingress {
    description = "SSH from anywhere"
    from_port   = 22
    to_port     = 22
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

resource "aws_security_group" "api_access" {
  name        = "allow_api_access"
  description = "Allow inbound traffic to API"

  ingress {
    description = "Allow HTTPS traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
