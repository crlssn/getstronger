resource "aws_route53_zone" "hosted_zone" {
  name = var.domain
}

# Standard DNS records (e.g., A, CNAME)
resource "aws_route53_record" "records" {
  for_each = var.records

  zone_id = aws_route53_zone.hosted_zone.zone_id
  name    = "${each.key}.${var.domain}"
  type    = each.value.type
  ttl     = each.value.ttl
  records = each.value.records
}

# Alias DNS records (e.g., pointing to CloudFront or S3)
resource "aws_route53_record" "aliases" {
  for_each = var.aliases

  zone_id = aws_route53_zone.hosted_zone.zone_id
  name    = "${each.key}.${var.domain}"
  type    = each.value.type

  alias {
    name                   = each.value.alias_name
    zone_id                = each.value.alias_zone_id
    evaluate_target_health = each.value.evaluate_target_health
  }
}

# SSL validation DNS records
resource "aws_route53_record" "ssl_records" {
  for_each = var.ssl_validation_records

  zone_id = aws_route53_zone.hosted_zone.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = each.value.ttl
  records = [each.value.value]
}
