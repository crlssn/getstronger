terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  backend "s3" {
    bucket = "www.getstronger.co"
    key    = "state.tfstate"
    region = "eu-west-2"
  }

  required_version = ">= 1.2.0"
}

provider "aws" {
  region = var.aws_region
}
