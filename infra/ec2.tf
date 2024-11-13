resource "aws_instance" "backend" {
  instance_type = "t2.micro"
}

output "ec2_instance_public_ip" {
  value = aws_instance.backend.public_ip
}
