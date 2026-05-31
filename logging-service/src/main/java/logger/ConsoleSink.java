package logger;

import java.io.PrintStream;
import java.util.Map;

public class ConsoleSink implements Sink {
    private final PrintStream stream;

    public ConsoleSink() {
        this(System.out);
    }

    public ConsoleSink(PrintStream stream) {
        this.stream = stream == null ? System.out : stream;
    }

    @Override
    public void write(String formatted) {
        stream.println(formatted);
        stream.flush();
        
        String target = (stream == System.err) ? "stderr" : "stdout";
        EventBus.emit("sink_write", Map.of(
            "sink", "ConsoleSink",
            "target", target,
            "text", formatted
        ));
    }
}
