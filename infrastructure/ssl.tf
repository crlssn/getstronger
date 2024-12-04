provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Obtain an SSL certificate
resource "aws_acm_certificate" "www_getstronger_pro_ssl_cert" {
  provider    = aws.us_east_1
  domain_name = "www.getstronger.pro"
  # subject_alternative_names = ["getstronger.pro"]
  validation_method = "DNS"
}

# Validate the certificate
resource "aws_route53_record" "s3_ssl_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.www_getstronger_pro_ssl_cert.domain_validation_options : dvo.domain_name => dvo
  }

  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "s3_cert_validation" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.www_getstronger_pro_ssl_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.s3_ssl_cert_validation : record.fqdn]
  depends_on = [
    aws_acm_certificate.www_getstronger_pro_ssl_cert,
    aws_route53_record.s3_ssl_cert_validation
  ]
}

# Create CloudFront distribution for the S3 bucket
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

  # Custom error response to handle SPA routing for all 403 errors
  custom_error_response {
    error_code            = 403
    response_page_path    = "/index.html"
    response_code         = 200
    error_caching_min_ttl = 0
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

# Obtain an SSL certificate for EC2 instance
resource "aws_acm_certificate" "api_getstronger_pro_ssl_cert" {
  provider          = aws.us_east_1
  domain_name       = "api.getstronger.pro"
  validation_method = "DNS"
}

# Validate the certificate
resource "aws_route53_record" "api_getstronger_pro_ssl_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api_getstronger_pro_ssl_cert.domain_validation_options : dvo.domain_name => dvo
  }

  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api_getstronger_pro_cert_validation" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.api_getstronger_pro_ssl_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.api_getstronger_pro_ssl_cert_validation : record.fqdn]
  depends_on = [
    aws_acm_certificate.api_getstronger_pro_ssl_cert,
    aws_route53_record.api_getstronger_pro_ssl_cert_validation
  ]
}

# Create CloudFront distribution for EC2 instance
resource "aws_cloudfront_distribution" "api_getstronger_pro_distribution" {
  provider = aws.us_east_1

  origin {
    domain_name = "api.getstronger.pro"
    origin_id   = "EC2-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "/"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "EC2-origin"

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
    acm_certificate_arn = aws_acm_certificate.api_getstronger_pro_ssl_cert.arn
    ssl_support_method  = "sni-only"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "EC2CloudFrontDistribution"
  }
}

resource "null_resource" "letsencrypt_cert" {
  provisioner "remote-exec" {
    connection {
      host        = aws_instance.backend.public_ip
      type        = "ssh"
      user        = "ec2-user"
      private_key = file("~/.ssh/id_rsa")
    }

    # Install Certbot and generate the certificate
    inline = [
      "sudo dnf update -y",
      "sudo dnf install -y certbot",
      "sudo certbot certonly --standalone -d api.getstronger.pro --non-interactive --agree-tos -m admin@getstronger.pro",
      "sudo systemctl start certbot-renew.timer",
    ]
  }
}

resource "aws_acm_certificate" "non_www_getstronger_pro_ssl_cert" {
  provider                  = aws.us_east_1
  domain_name               = "getstronger.pro"
  validation_method         = "DNS"
}

resource "aws_route53_record" "non_www_ssl_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.non_www_getstronger_pro_ssl_cert.domain_validation_options : dvo.domain_name => dvo
  }

  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "non_www_cert_validation" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.non_www_getstronger_pro_ssl_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.non_www_ssl_cert_validation : record.fqdn]
}

resource "aws_cloudfront_distribution" "redirect_distribution" {
  provider = aws.us_east_1

  origin {
    domain_name = aws_s3_bucket.redirect_getstronger_pro.bucket_regional_domain_name
    origin_id   = "RedirectBucket"
  }

  enabled         = true
  is_ipv6_enabled = true

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "RedirectBucket"

    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  viewer_certificate {
    acm_certificate_arn            = aws_acm_certificate.non_www_getstronger_pro_ssl_cert.arn
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "RedirectToWWW"
  }
}
