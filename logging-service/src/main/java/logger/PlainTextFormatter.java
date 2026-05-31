package logger;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public class PlainTextFormatter implements Formatter {
    public static final String DEFAULT_PATTERN = "{timestamp} [{level}] [{thread_name}] ({logger_name}) - {message}";
    
    private static final DateTimeFormatter DATE_FORMATTER = 
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
                         .withZone(ZoneId.systemDefault());

    private final String pattern;

    public PlainTextFormatter() {
        this(DEFAULT_PATTERN);
    }

    public PlainTextFormatter(String pattern) {
        this.pattern = pattern == null ? DEFAULT_PATTERN : pattern;
    }

    @Override
    public String format(LogRecord record) {
        Instant instant = Instant.ofEpochMilli((long) (record.timestamp() * 1000));
        String tsStr = DATE_FORMATTER.format(instant);

        return pattern.replace("{timestamp}", tsStr)
                      .replace("{level}", record.level().name())
                      .replace("{thread_name}", record.threadName())
                      .replace("{logger_name}", record.loggerName())
                      .replace("{message}", record.message());
    }
}
