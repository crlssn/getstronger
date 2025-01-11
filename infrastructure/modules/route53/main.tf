resource "aws_route53_zone" "hosted_zone" {
  name = var.domain
}

resource "aws_route53_record" "records" {
  for_each = var.subdomains

  zone_id = var.zone_id
  name    = "${each.key}.${var.domain}"
  type    = each.value.type
  ttl     = each.value.ttl

  records = each.value.alias == null ? each.value.records : []

  dynamic "alias" {
    for_each = each.value.alias != null ? ["ok"] : []
    content {
      name                   = each.value.alias.name
      zone_id                = each.value.alias.zone_id
      evaluate_target_health = each.value.alias.evaluate_target_health
    }
  }
}
