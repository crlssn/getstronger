variable "domain" {
  description = "The domain name to create the hosted zone for"
  type        = string
}

variable "api_record_ip" {
  description = "The IP address for the API record"
  type        = string
}

variable "api_record_ttl" {
  description = "The TTL for the API DNS record"
  type        = number
  default     = 300
}

variable "cloudfront_alias_name" {
  description = "The alias name for the CloudFront distribution"
  type        = string
}

variable "cloudfront_alias_zone_id" {
  description = "The hosted zone ID for the CloudFront distribution alias"
  type        = string
}

variable "cloudfront_evaluate_target_health" {
  description = "Whether to evaluate target health for the CloudFront alias"
  type        = bool
  default     = false
}

variable "ssh_record_ip" {
  description = "The IP address for the SSH record"
  type        = string
}

variable "ssh_record_ttl" {
  description = "The TTL for the SSH DNS record"
  type        = number
  default     = 300
}

variable "ec2_instance_id" {
  description = "The ID of the EC2 instance"
  type        = string
}
