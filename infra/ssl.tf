provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Obtain an SSL certificate
resource "aws_acm_certificate" "www_getstronger_pro_ssl_cert" {
  provider = aws.us_east_1
  domain_name = "www.getstronger.pro"
  validation_method = "DNS"
}

# # Validate the certificate
resource "aws_route53_record" "s3_ssl_cert_validation" {
  for_each = { for dvo in aws_acm_certificate.www_getstronger_pro_ssl_cert.domain_validation_options : dvo.domain_name => dvo }

  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "s3_cert_validation" {
  provider = aws.us_east_1
  certificate_arn         = aws_acm_certificate.www_getstronger_pro_ssl_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.s3_ssl_cert_validation : record.fqdn]
  depends_on = [
    aws_acm_certificate.www_getstronger_pro_ssl_cert,
    aws_route53_record.s3_ssl_cert_validation
  ]
}

# # Create CloudFront distribution for the S3 bucket
resource "aws_cloudfront_distribution" "www_getstronger_pro_distribution" {
  provider = aws.us_east_1
  origin {
    domain_name = aws_s3_bucket.www_getstronger_pro.bucket_domain_name
    origin_id   = "S3-origin"
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  aliases = ["www.getstronger.pro"]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-origin"

    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # Associate SSL certificate
  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate.www_getstronger_pro_ssl_cert.arn
    ssl_support_method  = "sni-only"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "S3CloudFrontDistribution"
  }
}
