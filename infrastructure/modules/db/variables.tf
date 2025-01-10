variable "allocated_storage" {
  description = "The allocated storage size in GB"
  type        = number
  default     = 20
}

variable "storage_type" {
  description = "The storage type for the RDS instance"
  type        = string
  default     = "gp2"
}

variable "engine" {
  description = "The database engine"
  type        = string
  default     = "postgres"
}

variable "engine_version" {
  description = "The database engine version"
  type        = string
  default     = "16.4"
}

variable "instance_class" {
  description = "The instance class for the RDS instance"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "The name of the database"
  type        = string
  default     = "getstronger"
}

variable "username" {
  description = "The username for the database"
  type        = string
}

variable "password" {
  description = "The password for the database"
  type        = string
  sensitive   = true
}

variable "parameter_group_name" {
  description = "The parameter group name for the database"
  type        = string
  default     = "default.postgres16"
}

variable "skip_final_snapshot" {
  description = "Whether to skip the final snapshot on deletion"
  type        = bool
  default     = true
}

variable "identifier" {
  description = "The unique identifier for the RDS instance"
  type        = string
}

variable "publicly_accessible" {
  description = "Whether the database is publicly accessible"
  type        = bool
  default     = true
}

variable "security_group_name" {
  description = "The name of the security group"
  type        = string
  default     = "db-access"
}

variable "security_group_description" {
  description = "The description of the security group"
  type        = string
  default     = "Allow public access to RDS instance"
}

variable "db_port" {
  description = "The database port"
  type        = number
  default     = 5432
}

variable "ingress_cidr_blocks" {
  description = "The CIDR blocks allowed to access the database"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
