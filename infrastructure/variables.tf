variable "db_username" {
  description = "The username for the RDS instance"
  type        = string
}

variable "db_password" {
  description = "The password for the RDS instance"
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-west-2"
}

variable "domain" {
  default = "getstronger.pro"
  type    = string
}

variable "ec2_public_key" {
  description = "The public key for the EC2 key pair"
  type        = string
  default     = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDIW6zV0WOcWG4+CizaD9KkgbHvtz4yJNdy5RuMl1GfLqWC5bosw7gejuI4+0WKvp+zePMdcZUh3pu+Quor9ttc3agQybS1sc5ipHOYk+sGVZUIM70wVvtTtj5M3tnycUps41Ufv9CgSl0WiUH1kURBvUQdqtLjrViNK1V8rsDx6lRTS9zNFXd8K+EVujztgnsygWL934qcvu8mZUb5SXvhgJq1LmsVY4uVkH4sVP8c1IbuBtPL+O+JLfDCwNGZqBYKehaVz14+It9+wqW2Df/izQVcgzUOX8wl1jEa808CGHx3QuW8WOmDxeiIUzfN0LzA2O4WAJGEfIwX2fVXSLSN6vTegteDs5g7Sree74UZglMtzvvozInyCOLkGeNQFyeN3Kuc/bs6Sp7iAdO/3w/YT3AI+U2CkAJ8GMw+nDEUTskloO5I4IANCttBm11fqAR3Lij8cxZsheVrKhgYXmaoEOh62FRoOW4GxsGZRfaeG5Rb4T9rINyjY4KV2mgpkr9OMwfSAkugEDZUHVgZEdfAxqOgngQ7PgNt/N2G+sNwzbOQ9GbIpa86FLa0/fchqfFjKJWDZ6VJTybjDDpLASCOnmoVrgYe4imvoCXqEJulnuoxOhkY3yfuqwY3c5nWD3PSXWe/UnHe9+7u5qlOKNZ5TkSvULOBww78qYXLZXM2Ew== christian@Mac"
}
