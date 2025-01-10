output "instance_id" {
  description = "The ID of the EC2 instance"
  value       = aws_instance.ec2_instance.id
}

output "public_ip" {
  description = "The public IP address of the EC2 instance"
  value       = aws_instance.ec2_instance.public_ip
}

output "ssh_security_group_id" {
  description = "The ID of the SSH security group"
  value       = aws_security_group.ssh_access.id
}

output "api_security_group_id" {
  description = "The ID of the API security group"
  value       = aws_security_group.api_access.id
}
