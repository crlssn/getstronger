output "db_instance_identifier" {
  description = "The identifier of the RDS instance"
  value       = aws_db_instance.db_instance.id
}

output "db_endpoint" {
  description = "The endpoint for the RDS instance"
  value       = aws_db_instance.db_instance.endpoint
}

output "security_group_id" {
  description = "The ID of the security group for database access"
  value       = aws_security_group.db_access.id
}
