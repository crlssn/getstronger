module "acm" {
  source  = "terraform-aws-modules/acm/aws"
  version = "~> 4.0"

  domain_name  = "getstronger.pro"
  zone_id      = aws_route53_zone.getstronger_pro.zone_id

  validation_method = "DNS"

  subject_alternative_names = [
    "www.getstronger.pro",
    "api.getstronger.pro",
  ]

  wait_for_validation = false

  tags = {
    Name = "getstronger.pro"
  }
}
