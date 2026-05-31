package logger;

public record LogRecord(
    double timestamp, // Unix epoch seconds
    LogLevel level,
    String message,
    String threadName,
    String loggerName
) {}
