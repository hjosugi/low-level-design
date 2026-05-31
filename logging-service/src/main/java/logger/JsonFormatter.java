package logger;

import java.time.Instant;
import java.time.format.DateTimeFormatter;

public class JsonFormatter implements Formatter {
    @Override
    public String format(LogRecord record) {
        Instant instant = Instant.ofEpochMilli((long) (record.timestamp() * 1000));
        String isoStr = DateTimeFormatter.ISO_INSTANT.format(instant);

        return "{"
            + "\"timestamp\":" + record.timestamp() + ","
            + "\"timestamp_iso\":\"" + escapeJson(isoStr) + "\","
            + "\"level\":\"" + escapeJson(record.level().name()) + "\","
            + "\"level_val\":" + record.level().getValue() + ","
            + "\"thread\":\"" + escapeJson(record.threadName()) + "\","
            + "\"logger\":\"" + escapeJson(record.loggerName()) + "\","
            + "\"message\":\"" + escapeJson(record.message()) + "\""
            + "}";
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < input.length(); i++) {
            char ch = input.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < ' ') {
                        String t = "000" + Integer.toHexString(ch);
                        sb.append("\\u").append(t.substring(t.length() - 4));
                    } else {
                        sb.append(ch);
                    }
            }
        }
        return sb.toString();
    }
}
