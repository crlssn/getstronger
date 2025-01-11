output "hosted_zone_id" {
  description = "The ID of the hosted zone"
  value       = aws_route53_zone.hosted_zone.zone_id
}
