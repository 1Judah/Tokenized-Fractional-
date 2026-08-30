variable "environment" {
  type    = string
  default = "production"
}

variable "webhook_endpoint" {
  type        = string
  description = "Slack or PagerDuty SNS HTTPS subscription endpoint"
  default     = "https://hooks.slack.com/services/T00/B00/X00"
}

variable "instance_id" {
  type        = string
  description = "EC2 Instance ID to monitor"
}

resource "aws_sns_topic" "alerts_topic" {
  name = "rwa-service-degradation-alerts-${var.environment}"
}

resource "aws_sns_topic_subscription" "webhook_sub" {
  topic_arn = aws_sns_topic.alerts_topic.arn
  protocol  = "https"
  endpoint  = var.webhook_endpoint
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "rwa-${var.environment}-cpu-utilization-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Triggered when EC2 CPU utilization exceeds 80% for 10 minutes."
  alarm_actions       = [aws_sns_topic.alerts_topic.arn]
  ok_actions          = [aws_sns_topic.alerts_topic.arn]

  dimensions = {
    InstanceId = var.instance_id
  }
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "rwa-${var.environment}-memory-utilization-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "Triggered when instance memory utilization exceeds 85% for 10 minutes."
  alarm_actions       = [aws_sns_topic.alerts_topic.arn]
  ok_actions          = [aws_sns_topic.alerts_topic.arn]

  dimensions = {
    InstanceId = var.instance_id
  }
}
