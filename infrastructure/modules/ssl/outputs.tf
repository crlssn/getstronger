output "certificate_arn" {
  description = "The ARN of the SSL certificate"
  value       = aws_acm_certificate.ssl_certificate.arn
}

output "distribution_domain_name" {
  description = "The domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.distribution.domain_name
}

output "distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.distribution.id
}

output "distribution_zone_id" {
  description = "The Route 53 hosted zone ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.distribution.hosted_zone_id
}
