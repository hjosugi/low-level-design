package logger;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

public class EventBus {
    private static final List<BlockingQueue<String>> listeners = new CopyOnWriteArrayList<>();

    public static BlockingQueue<String> register() {
        BlockingQueue<String> q = new LinkedBlockingQueue<>(1000);
        listeners.add(q);
        return q;
    }

    public static void unregister(BlockingQueue<String> q) {
        if (q != null) {
            listeners.remove(q);
        }
    }

    public static void emit(String type, Map<String, Object> data) {
        String payload = buildJsonPayload(type, data);
        for (BlockingQueue<String> q : listeners) {
            if (!q.offer(payload)) {
                // If a client queue overflows, poll the oldest event to make room
                q.poll();
                q.offer(payload);
            }
        }
    }

    private static String buildJsonPayload(String type, Map<String, Object> data) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"type\":\"").append(escape(type)).append("\",");
        sb.append("\"data\":{");
        
        boolean first = true;
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            if (!first) {
                sb.append(",");
            }
            first = false;
            
            sb.append("\"").append(escape(entry.getKey())).append("\":");
            Object val = entry.getValue();
            if (val instanceof Number || val instanceof Boolean) {
                sb.append(val);
            } else if (val == null) {
                sb.append("null");
            } else {
                sb.append("\"").append(escape(val.toString())).append("\"");
            }
        }
        
        sb.append("},");
        sb.append("\"time\":").append(System.currentTimeMillis() / 1000.0);
        sb.append("}");
        return sb.toString();
    }

    private static String escape(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");
    }
}
