package logger;

public enum LogLevel {
    DEBUG(10),
    INFO(20),
    WARN(30),
    ERROR(40),
    FATAL(50);

    private final int value;

    LogLevel(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static LogLevel fromStr(String value) {
        if (value == null) {
            return INFO;
        }
        String name = value.toUpperCase().trim();
        switch (name) {
            case "DEBUG":
                return DEBUG;
            case "WARN":
            case "WARNING":
                return WARN;
            case "ERROR":
                return ERROR;
            case "FATAL":
                return FATAL;
            case "INFO":
            default:
                return INFO;
        }
    }
}
