resource "aws_route53_zone" "getstronger_pro" {
  name = "getstronger.pro"
}

# Elastic IP for EC2 instance
resource "aws_eip" "ec2_instance" {
  instance = aws_instance.backend.id
}

# Route 53 record for api.getstronger.pro -> EC2 instance
resource "aws_route53_record" "api_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "api.getstronger.pro"
  type    = "A"
  ttl     = 300
  records = [aws_eip.ec2_instance.public_ip]
}

# Route 53 CNAME record for www.getstronger.pro -> S3 bucket
resource "aws_route53_record" "www_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "www.getstronger.pro"
  type    = "A" # Change type to "A" for alias records with CloudFront

  alias {
    name                   = aws_cloudfront_distribution.www_getstronger_pro_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.www_getstronger_pro_distribution.hosted_zone_id
    evaluate_target_health = false
  }
  # zone_id = aws_route53_zone.getstronger_pro.zone_id
  # name    = "www.getstronger.pro"
  # type    = "CNAME"
  # ttl     = 300
  # records = [aws_s3_bucket.www_getstronger_pro.website_endpoint]
}

resource "aws_route53_record" "ssh_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "ssh.getstronger.pro"
  type    = "A"
  ttl     = 300
  records = [aws_eip.ec2_instance.public_ip]
}
