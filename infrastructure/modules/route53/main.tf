resource "aws_route53_zone" "hosted_zone" {
  name = var.domain
}

resource "aws_route53_record" "records" {
  for_each = var.subdomains

  zone_id = var.zone_id
  name    = "${each.key}.${var.domain}"
  type    = each.value.type
  ttl     = each.value.ttl

  records = each.value.records
  alias {
    name                   = each.value.alias_name
    zone_id                = each.value.alias_zone_id
    evaluate_target_health = each.value.evaluate_target_health
  }
}
