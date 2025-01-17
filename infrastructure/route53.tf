resource "aws_route53_zone" "getstronger_pro" {
  name = var.domain
}

resource "aws_eip" "ec2_instance" {
  instance = aws_instance.backend.id
}

resource "aws_route53_record" "api_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "api.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.ec2_instance.public_ip]
}

resource "aws_route53_record" "www_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "www.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.www_getstronger_pro_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.www_getstronger_pro_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ssh_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "ssh.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.ec2_instance.public_ip]
}
