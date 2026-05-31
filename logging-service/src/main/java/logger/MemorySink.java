package logger;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class MemorySink implements Sink {
    private final List<String> logs = Collections.synchronizedList(new ArrayList<>());

    @Override
    public void write(String formatted) {
        logs.add(formatted);
        
        EventBus.emit("sink_write", Map.of(
            "sink", "MemorySink",
            "target", "memory",
            "text", formatted
        ));
    }

    public List<String> getLogs() {
        return new ArrayList<>(logs);
    }

    public void clear() {
        logs.clear();
    }
}
