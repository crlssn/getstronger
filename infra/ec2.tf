resource "aws_instance" "backend" {
  ami           = "ami-02f617729751b375a"
  instance_type = "t2.micro"
  security_groups = [aws_security_group.ssh_access.name]
}

resource "aws_security_group" "ssh_access" {
  name        = "allow_ssh"
  description = "Allow SSH inbound traffic"

  ingress {
    description = "SSH from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # DEBT: Do not allow SSH from anywhere
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}


output "ec2_instance_public_ip" {
  value = aws_instance.backend.public_ip
}
