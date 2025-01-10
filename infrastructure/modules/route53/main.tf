resource "aws_route53_zone" "hosted_zone" {
  name = var.domain
}

resource "aws_route53_record" "api_record" {
  zone_id = aws_route53_zone.hosted_zone.zone_id
  name    = "api.${var.domain}"
  type    = "A"
  ttl     = var.api_record_ttl
  records = [var.api_record_ip]
}

resource "aws_route53_record" "www_record" {
  zone_id = aws_route53_zone.hosted_zone.zone_id
  name    = "www.${var.domain}"
  type    = "A"

  alias {
    name                   = var.cloudfront_alias_name
    zone_id                = var.cloudfront_alias_zone_id
    evaluate_target_health = var.cloudfront_evaluate_target_health
  }
}

resource "aws_route53_record" "ssh_record" {
  zone_id = aws_route53_zone.hosted_zone.zone_id
  name    = "ssh.${var.domain}"
  type    = "A"
  ttl     = var.ssh_record_ttl
  records = [var.ssh_record_ip]
}

resource "aws_eip" "ec2_instance" {
  instance = var.ec2_instance_id
}
